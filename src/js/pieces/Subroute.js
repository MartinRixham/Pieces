define(["./CompoundWord"], function(CompoundWord) {

	function Subroute(route, getCurrentIndex, showPage) {

		var words = [];

		var scrollIndex = -1;

		this.setUpdating = function() {

			route.setUpdating();
		};

		this.addRoute = function(word, simple) {

			dispose();

			if (scrollIndex == -1) {

				return route.addRoute(word);
			}

			var index = scrollIndex;

			scrollIndex = -1;

			for (var i = 0; i < words.length; i++) {

				if (!words[i].hasIndex(index)) {

					var subrouter = getRouter(words[i].getRouter().get(), index, simple);

					subrouter.setUpdating();
					words[i].add(index, word);
					word.set(subrouter.getWord(), subrouter.getIndex(), function() {});

					return subrouter;
				}
			}

			var newWord = new CompoundWord(getCurrentIndex);
			var newIndex = words.length;
			var router = getRouter(route.addRoute(newWord), index, simple);

			words[newIndex] = newWord;
			words[newIndex].setRouter(router);
			words[newIndex].add(index, word);
			word.set(router.getWord(), router.getIndex(), function() {});

			return router;
		};

		function dispose() {

			for (var i = 0; i < words.length; i++) {

				if (words[i].dispose) {

					words.splice(i, 1);
				}
			}
		}

		function getRouter(router, index, simple) {

			if (simple) {

				return router;
			}

			return {

				setUpdating: function() {

					router.setUpdating();
				},
				changePage: function() {

					for (var i = index + 1; i < words.length; i++) {

						words[i].remove(getCurrentIndex());
					}
				},
				update: function(reference) {

					if (getCurrentIndex() != index) {

						router.setUpdating();

						showPage(index);

						eventuallyUpdate(router, index, 100, reference);
					}

					router.update(reference);
				},
				getIndex: function() {

					return router.getIndex();
				},
				getWord: function() {

					if (getCurrentIndex() == index) {

						return router.getWord();
					}
					else {

						return "";
					}
				},
				get: function() {

					return router;
				}
			};
		}

		function eventuallyUpdate(router, index, retry, reference) {

			if (getCurrentIndex() == index) {

				setTimeout(function() {

					router.update(reference);
				}, 50);
			}
			else if (retry) {

				setTimeout(function() {

					eventuallyUpdate(router, index, --retry, reference);
				}, 10);
			}
			else {

				router.update(reference);
			}
		}

		this.update = function(index) {

			route.update(index);
		};

		this.callHome = function(index) {

			scrollIndex = index;
		};
	}

	return Subroute;
});

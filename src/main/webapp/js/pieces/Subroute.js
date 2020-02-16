define(["./CompoundWord"], function(CompoundWord) {

	function Subroute(route, getCurrentIndex, showPage) {

		var words = [];

		var scrollIndex = -1;

		this.setUpdating = function() {

			route.setUpdating();
		};

		this.addRoute = function(word, simple) {

			if (scrollIndex == -1) {

				return route.addRoute(word);
			}

			var index = scrollIndex;

			scrollIndex = -1;

			for (var i = 0; i < words.length; i++) {

				if (!words[i].hasIndex(index)) {

					var parent = words[i].getRouter().get();

					parent.setUpdating();
					words[i].add(index, word);
					word.set(parent.getWord(), parent.getIndex(), function() {});

					return getRouter(parent, index, simple);
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

					return router.getWord();
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

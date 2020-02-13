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

					words[i].getRouter().setUpdating();
					words[i].add(index, word);

					return getRouter(words[i].getRouter(), index, simple);
				}
			}

			var newWord = new CompoundWord(getCurrentIndex);
			var newIndex = words.length;
			var router = route.addRoute(newWord);

			words[newIndex] = newWord;
			words[newIndex].setRouter(router);
			words[newIndex].add(index, word);

			return getRouter(router, index, simple);
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

					router.changePage();
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

		this.changePage = function(index) {

			route.changePage(index);
		};

		this.callHome = function(index) {

			scrollIndex = index;
		};
	}

	return Subroute;
});

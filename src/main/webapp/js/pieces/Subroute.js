define(["./CompoundWord"], function(CompoundWord) {

	function Subroute(route, getCurrentIndex, showPage) {

		var words = [];

		var scrollIndex = -1;

		var currentIndex = 0;

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

					words[i].add(index, word);

					return getRouter(words[i].getRouter(), index, this.setIndex, simple);
				}
			}

			var newWord = new CompoundWord(currentIndex);
			var router = route.addRoute(newWord);
			var newIndex = words.length;

			words[newIndex] = newWord;
			words[newIndex].setRouter(router);
			words[newIndex].add(index, word);

			return getRouter(router, index, this.setIndex, simple);
		};

		function getRouter(router, index, setIndex, simple) {

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
				update: function() {

					if (getCurrentIndex() == index) {

						router.update();
					}
					else {

						setIndex(index);
						showPage(index);

						eventuallyUpdate(router, index, 100);
					}
				},
				getIndex: function() {

					return router.getIndex();
				}
			};
		}

		function eventuallyUpdate(router, index, retry) {

			if (getCurrentIndex() == index) {

				setTimeout(function() {

					router.update();
				}, 50);
			}
			else if (retry) {

				setTimeout(function() {

					eventuallyUpdate(router, index, --retry);
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

		this.setIndex = function(index) {

			currentIndex = index;

			for (var i = 0; i < words.length; i++) {

				words[i].setIndex(index);
			}
		};
	}

	return Subroute;
});
